import {
  Alert,
  AlertDescription,
  AlertIcon,
  Avatar,
  Button,
  Flex,
  FormControl,
  FormControlProps,
  FormErrorMessage,
  FormLabel,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Progress,
  Radio,
  RadioGroup,
  Select,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { chakraComponents, GroupBase, OptionProps, Select as RSelect } from 'chakra-react-select'
import { useEffect, useState } from 'react'
import { Controller, useFieldArray, useFormContext } from 'react-hook-form'
import { BiTrash } from 'react-icons/bi'
import { MdArrowDropDown } from 'react-icons/md'
import { Link as RouterLink } from 'react-router-dom'
import { RoutePath } from '~constants'
import { fetchTokenBasedBlockchains } from '~queries/census'
import { fetchCommunitiesByAdmin, fetchCommunityStatus } from '~queries/communities'
import { ucfirst } from '~util/strings'
import { useAuth } from './Auth/useAuth'
import ChannelSelector, { ChannelFormValues } from './Census/ChannelSelector'
import { CreateFarcasterCommunityButton } from './Layout/DegenButton'

export type CensusFormValues = ChannelFormValues & {
  censusType: CensusType
  addresses?: Address[]
  community?: Community
  csv?: File | undefined
}

export type CensusTypeSelectorProps = FormControlProps & {
  oneClickPoll?: boolean
  communityId?: string
  admin?: boolean
  showAsSelect?: boolean
}

const CensusTypeSelector = ({
  oneClickPoll,
  communityId,
  admin,
  showAsSelect,
  isDisabled,
  ...props
}: CensusTypeSelectorProps) => {
  const { bfetch, profile, isAuthenticated } = useAuth()
  const {
    control,
    formState: { errors },
    register,
    setValue,
    watch,
  } = useFormContext<CensusFormValues>()
  const {
    fields: addressFields,
    append: appendAddress,
    remove: removeAddress,
  } = useFieldArray({
    control,
    name: 'addresses',
  })
  const { data: blockchains, isLoading: bloading } = useQuery({
    queryKey: ['blockchains'],
    queryFn: fetchTokenBasedBlockchains(bfetch),
  })
  const {
    data: communities,
    isLoading: cloading,
    isSuccess,
  } = useQuery({
    queryKey: ['communities', 'byAdmin', profile?.fid],
    queryFn: fetchCommunitiesByAdmin(bfetch, profile!, { offset: 0, limit: 20 }),
    enabled: isAuthenticated && !!oneClickPoll,
  })
  const [initCommunity, setInitCommunity] = useState<Community | undefined>(undefined)
  const [syncProgress, setSyncProgress] = useState<number | null>(null)

  const censusType = watch('censusType')
  const addresses = watch('addresses')
  const community = watch('community')

  // reset address fields when censusType changes
  useEffect(() => {
    if ((censusType === 'erc20' || censusType === 'nft') && addresses && !addresses.length) {
      // Remove all fields initially
      setValue('addresses', [])
      // Add one field by default
      for (let i = 0; i < 1; i++) {
        appendAddress({ address: '', blockchain: 'base' })
      }
    }
  }, [censusType, addresses])

  // set community id if received (1st step)
  useEffect(() => {
    if (!communityId || cloading || !isSuccess) return

    setInitCommunity(communities?.communities.find((c) => c.id === communityId))
  }, [communityId, cloading, communities, isSuccess])

  // yeah we need to do it in two steps, or use a timeout which would have been a worse solution
  useEffect(() => {
    if (!initCommunity) return

    setValue('censusType', 'community')
    setValue('community', initCommunity)
  }, [initCommunity])

  const { mutate: checkCommunityStatus } = useMutation({
    mutationFn: fetchCommunityStatus(bfetch, community?.id as CommunityID),
    onSuccess: (data) => {
      if (data.ready) {
        setValue('community', { ...community, ready: true } as Community)
        setSyncProgress(null)
      } else {
        setSyncProgress(data.progress)
      }
    },
    onSettled: async () => {
      // Refetch communities to get the updated one
      if (community && !community.ready) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        checkCommunityStatus()
      }
    },
  })

  useEffect(() => {
    if (community && !community.ready) {
      checkCommunityStatus()
    }
  }, [community, checkCommunityStatus])

  const required = {
    value: true,
    message: 'This field is required',
  }

  const options = [
    { value: 'farcaster', label: '🌐 All farcaster users', visible: !!oneClickPoll },
    { value: 'community', label: '🏘️ Community based', visible: !!oneClickPoll },
    { value: 'channel', label: '⛩ Farcaster channel gated' },
    { value: 'followers', label: '❤️ My Farcaster followers and me' },
    { value: 'nft', label: '🎨 NFT based' },
    { value: 'erc20', label: '💰 ERC20 based' },
  ].filter((o) => o.visible !== false)

  return (
    <>
      <FormControl {...props} isRequired isDisabled={isDisabled}>
        <FormLabel>Census/voters</FormLabel>
        {showAsSelect ? (
          <Controller
            name='censusType'
            control={control}
            render={({ field }) => (
              <RSelect
                placeholder='Select census type'
                options={options}
                value={options.find((option) => option.value === field.value)}
                onChange={(selectedOption) => field.onChange(selectedOption?.value)}
              />
            )}
          />
        ) : (
          <RadioGroup onChange={(val: CensusType) => setValue('censusType', val)} value={censusType} id='census-type'>
            <Stack direction='column' flexWrap='wrap'>
              {options.map((option, index) => (
                <Radio key={index} value={option.value} isDisabled={isDisabled}>
                  {option.label}
                </Radio>
              ))}
            </Stack>
          </RadioGroup>
        )}
      </FormControl>
      {censusType === 'community' &&
        (communities && communities?.communities.length ? (
          <FormControl isRequired isDisabled={isDisabled}>
            <FormLabel>Select a community</FormLabel>
            <Controller
              name='community'
              control={control}
              render={({ field }) => (
                <RSelect
                  placeholder='Choose a community'
                  isLoading={cloading}
                  options={communities?.communities.filter((c) => !c.disabled) || []}
                  getOptionLabel={(option: Community) => option.name}
                  getOptionValue={(option: Community) => option.id.toString()}
                  components={communitySelector}
                  {...field}
                />
              )}
            />
            {community && !community.ready && (
              <Alert status='info' mt={3}>
                <AlertIcon />
                <AlertDescription>
                  Your community is not ready yet, please wait for the bootstrap sync process to finish. This step only
                  needs to run once.
                  {syncProgress !== null && (
                    <>
                      <Text size='sm' fontWeight={500} mt={2}>
                        Progress: {syncProgress}%
                      </Text>
                      <Progress value={syncProgress} size='sm' colorScheme='purple' />
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </FormControl>
        ) : (
          <Flex alignItems='center' direction='column' w='full'>
            <Text>You don't have a community yet, want to create one?</Text>
            <CreateFarcasterCommunityButton />
          </Flex>
        ))}
      {['erc20', 'nft'].includes(censusType) && oneClickPoll && (
        <Alert status='info'>
          <AlertIcon />
          <AlertDescription>
            This type of census is only available for Votecaster Communities.{' '}
            <Button as={RouterLink} to={RoutePath.CommunitiesForm} colorScheme='purple' size='xs'>
              Create yours here.
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {['erc20', 'nft'].includes(censusType) &&
        !oneClickPoll &&
        addressFields.map((field, index) => (
          <FormControl key={field.id} {...props} isDisabled={isDisabled}>
            <FormLabel>
              {censusType.toUpperCase()} address {index + 1}
            </FormLabel>
            <Flex>
              <Select
                {...register(`addresses.${index}.blockchain`, { required })}
                defaultValue='eth'
                w='auto'
                icon={bloading ? <Spinner /> : <MdArrowDropDown />}
              >
                {blockchains &&
                  blockchains.map((blockchain, key) => (
                    <option value={blockchain} key={key}>
                      {ucfirst(blockchain)}
                    </option>
                  ))}
              </Select>
              <InputGroup>
                <Input placeholder='Smart contract address' {...register(`addresses.${index}.address`, { required })} />
                {addressFields.length > 1 && (
                  <InputRightElement>
                    <IconButton
                      aria-label='Remove address'
                      icon={<BiTrash />}
                      onClick={() => removeAddress(index)}
                      size='sm'
                    />
                  </InputRightElement>
                )}
              </InputGroup>
            </Flex>
          </FormControl>
        ))}
      {censusType === 'nft' && !oneClickPoll && addressFields.length < 3 && (
        <Button variant='ghost' onClick={() => appendAddress({ address: '', blockchain: 'base' })}>
          Add address
        </Button>
      )}
      {censusType === 'channel' && (
        <FormControl isRequired isInvalid={!!errors.channel} {...props} isDisabled={isDisabled}>
          <FormLabel htmlFor='channel'>Farcaster channel</FormLabel>
          <Controller name='channel' render={({ field }) => <ChannelSelector admin={admin} {...field} />} />
          <FormErrorMessage>{errors.channel?.message?.toString()}</FormErrorMessage>
        </FormControl>
      )}
    </>
  )
}

export default CensusTypeSelector

const communitySelector = {
  Option: ({ children, ...props }: OptionProps<any, false, GroupBase<any>>) => (
    <chakraComponents.Option {...props}>
      <Avatar size={'sm'} src={(props.data as Community).logoURL} mr={2} /> {children}
    </chakraComponents.Option>
  ),
}
